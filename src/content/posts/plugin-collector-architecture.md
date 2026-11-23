---
title: '把采集服务改成插件化：一个接口和一层隔离'
description: '协议从 3 种长到 11 种之后，采集服务的发布变成了一场赌博。改造的核心不是设计模式，是把"一个协议出错"限制在一个插件里。'
pubDate: 2026-11-05
tags: ['C#', 'ARCH', '.NET']
series: '采集服务重构'
---

最初是一个单体采集服务：OPC DA、Modbus TCP、一个厂商私有协议，都写在一个项目里，靠 `switch` 分发。后来协议数量涨到十几种，每次新增一种，就要重新发布整个服务，风险是"为了加一个没人用的协议，把稳定跑了半年的 OPC 采集弄挂了"。

## 拆分目标

不是追求架构漂亮，而是三个很具体的目标：

- 新增协议不改主程序，只加一个 DLL
- 单个协议崩溃不影响其他协议采集
- 采集逻辑可单独测试，不依赖真实设备

## 接口定义

```csharp
public interface IProtocolDriver : IDisposable
{
    string ProtocolName { get; }
    Task InitializeAsync(DriverOptions options, CancellationToken ct);
    Task<IReadOnlyList<TagValue>> ReadAsync(IReadOnlyList<TagDefinition> tags, CancellationToken ct);
}
```

`DriverOptions` 里只放通用字段（连接串、超时、重试），协议特有的参数放 `Dictionary<string,string>`，由插件自己解析。主程序不关心协议细节。

## 加载时隔离

关键一步是用 `AssemblyLoadContext` 给每个插件一个独立上下文，避免不同插件依赖不同版本的同一个库时互相顶掉：

```csharp
public sealed class DriverLoadContext : AssemblyLoadContext
{
    private readonly AssemblyDependencyResolver _resolver;

    public DriverLoadContext(string pluginPath)
        : base(isCollectible: true)
    {
        _resolver = new AssemblyDependencyResolver(pluginPath);
    }

    protected override Assembly? Load(AssemblyName name)
    {
        var path = _resolver.ResolveAssemblyToPath(name);
        return path is null ? null : LoadFromAssemblyPath(path);
    }
}
```

不用隔离也能跑，但只要两个插件依赖不同版本的序列化库，就会在某个下午突然报 `MissingMethodException`，而且只在部分机器上出现——这类问题排查成本极高。

## 采集边界

每个驱动跑在自己的循环里，异常在边界处收口：

```csharp
async Task RunDriverAsync(IProtocolDriver driver, Channel<Sample> sink, CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        try
        {
            var values = await driver.ReadAsync(tags, ct);
            foreach (var v in values) sink.TryWrite(v);
        }
        catch (OperationCanceledException) { break; }
        catch (Exception ex)
        {
            logger.LogError(ex, "{Protocol} read failed, backing off", driver.ProtocolName);
            await Task.Delay(TimeSpan.FromSeconds(5), ct); // 退避，避免打爆设备
        }
    }
}
```

注意这里**不吞异常重试到底**：连续失败超过阈值要上报状态，让平台侧知道"这台设备暂时不可用"，而不是在界面上显示上一次的旧值假装正常。

## 落地顺序

1. 抽出接口，先把现有三种协议包成插件，行为保持不变
2. 加插件目录扫描与配置绑定
3. 加隔离上下文与失败退避
4. 最后才做"热加载/卸载"（`isCollectible` 上下文配合卸载），这一步收益最小、坑最多

按这个顺序改，每一步都能单独上线验证。一上来就做热插拔，容易把本来稳定的采集一起带崩。
