---
title: 'OPC UA 连接异常排查：从 BadNodeIdUnknown 到证书链'
description: '一次现场 OPC UA 采集全员掉线的复盘。真正的坑不是网络，而是命名空间索引、非规范 NodeId 写法，以及被忽略的安全策略。'
pubDate: 2026-11-23
tags: ['OPCUA', 'DEBUG', '.NET']
series: 'OPC UA 实战'
---

现场采集服务同时掉了十几个点位，日志里只有一行 `BadNodeIdUnknown`。这类错误最容易被当成"地址写错了"，但实际能导致它的原因至少有四类，先分清层级再动手改地址。

## 1. 先看 StatusCode 的完整名字

OPC UA 的状态码不是一句话，而是一个 `0x8xxxxxxx` 的 32 位值。`BadNodeIdUnknown` 是 `0x80340000`，含义是"服务端不认识这个 NodeId"，而不是"连不上"。

| 现象 | 常见 StatusCode | 实际含义 |
| --- | --- | --- |
| 会话建立失败 | `BadSecurityChecksFailed` | 证书或安全策略不匹配 |
| 读单个点失败 | `BadNodeIdUnknown` | NodeId 或命名空间错 |
| 读点位超时 | `BadTimeout` | 订阅参数 / 网络 |
| 全部点位失败 | `BadSessionClosed` | 会话被服务端踢下线 |

如果仅仅是部分点位失败，基本可以把范围锁到 NodeId 写法本身。

## 2. NamespaceIndex 不是常量

最容易错的是把 NamespaceIndex 写死成 2。不同服务端、不同工程文件，索引都可能不同，而且重启后可能变化。

```csharp
// 从服务端的 NamespaceTable 里按 URI 查索引，别硬编码
var nsUri = "http://your-plant/schema";
var index = session.NamespaceUris.GetIndex(nsUri);
if (index < 0) throw new InvalidOperationException($"namespace not found: {nsUri}");

var nodeId = new NodeId("DB1.Real1", (ushort)index);
```

判断依据：同一个 URI 在这台服务端是 2，在另一台可能是 4。写死就必然有一侧全挂。

## 3. NodeId 的三种写法对应不同 Identifier

`NodeId` 的 identifier type 有 Numeric、String、Guid、Opaque。字符串形式的地址 `ns=2;s=Channel1.Device1.Tag1` 与 `ns=2;i=1001` 在服务端是两条不同的记录。

联调时先用 UaExpert 这类客户端确认"能读到"的 NodeId 字符串原文，再原样复制到代码里，不要凭记忆手写成 `ns=2;s=Channel1.Device1`（少了最后一段）。

## 4. 证书与安全策略：会被忽略的一层

前三点都对了仍然失败，看服务端的诊断日志。常见组合是客户端用 `None` 安全策略连接，而服务端已开启签名要求：

```csharp
var endpoint = endpoints
    .Where(e => e.SecurityPolicyUri == SecurityPolicyUris.Basic256Sha256)
    .FirstOrDefault()
    ?? throw new Exception("no compatible endpoint");
```

要点是**从服务端返回的 endpoint 列表里挑**，而不是自己构造。构造出来的 endpoint 与真实端口、策略、证书都不一致，出错时表现为连接直接超时，而不是返回明确错误码。

## 排查顺序

1. 打印完整 StatusCode 与出错的具体 NodeId
2. 核对 NamespaceIndex（从 NamespaceTable 查，不硬编码）
3. 核对 identifier type 与字符串原文
4. 核对 endpoint 的安全策略与证书信任列表
5. 只有以上都正确，才去怀疑网络与防火墙

按这个顺序走，一般十分钟内能定位。反过来从"网络不通"开始查，往往耗掉半天才发现是索引写错。
