---
title: 'Modbus 读到的浮点数是乱的：四种字节序必须能切换'
description: '同一个 Modbus TCP 设备，换个厂家读出来就是科学计数法噪声。问题不在解析代码，而在寄存器组合顺序，而且现场没有统一标准。'
pubDate: 2026-11-19
tags: ['MODBUS', 'DEBUG', '.NET']
---

Modbus 协议本身只定义 16 位寄存器，没有定义 32 位浮点怎么拼。结果就是：同一个 4 字节浮点，不同厂家的排列顺序可能完全不一样，而且文档里未必写清楚。

## 四种常见排列

按寄存器内高低字节与寄存器先后组合，共四种：

| 名称 | 寄存器顺序 | 字节顺序 |
| --- | --- | --- |
| ABCD | 高字在前 | 大端 |
| CDAB | 低字在前 | 大端 |
| BADC | 高字在前 | 小端交换 |
| DCBA | 低字在前 | 小端 |

其中 ABCD 与 DCBA 是"整体反转"，CDAB / BADC 是"字内或字间交换"。工程上遇到最多的是 ABCD 与 CDAB。

## 一个能切换的实现

```csharp
public enum WordOrder { ABCD, CDAB, BADC, DCBA }

public static float ToSingle(ushort[] regs, int offset, WordOrder order)
{
    var bytes = new byte[4];

    switch (order)
    {
        case WordOrder.ABCD:
            bytes[0] = (byte)(regs[offset] >> 8);
            bytes[1] = (byte)(regs[offset] & 0xFF);
            bytes[2] = (byte)(regs[offset + 1] >> 8);
            bytes[3] = (byte)(regs[offset + 1] & 0xFF);
            break;
        case WordOrder.CDAB:
            bytes[0] = (byte)(regs[offset + 1] >> 8);
            bytes[1] = (byte)(regs[offset + 1] & 0xFF);
            bytes[2] = (byte)(regs[offset] >> 8);
            bytes[3] = (byte)(regs[offset] & 0xFF);
            break;
        case WordOrder.BADC:
            bytes[0] = (byte)(regs[offset] & 0xFF);
            bytes[1] = (byte)(regs[offset] >> 8);
            bytes[2] = (byte)(regs[offset + 1] & 0xFF);
            bytes[3] = (byte)(regs[offset + 1] >> 8);
            break;
        case WordOrder.DCBA:
            bytes[0] = (byte)(regs[offset + 1] & 0xFF);
            bytes[1] = (byte)(regs[offset + 1] >> 8);
            bytes[2] = (byte)(regs[offset] & 0xFF);
            bytes[3] = (byte)(regs[offset] >> 8);
            break;
    }

    return BitConverter.ToSingle(bytes, 0);
}
```

关键点：`BitConverter.ToSingle` 只负责把 4 个字节按**当前机器的字节序**转成 float，字节怎么排是你的事。不要用 `Array.Reverse` 一把梭，那只能覆盖 ABCD / DCBA 两种情况。

## 怎么在现场判断到底用哪种

看数值落在什么区间最简单：

- 温度、压力这类物理量通常落在 `-100 ~ 1000`，用错顺序会得到 `1e+38` 或者 `1e-40` 这种明显不合理的值
- 流量、累计量偶尔会出现合理但完全错误的数（比如 320 变成 3.2），这时要看小数点位置

更稳妥的做法是让服务端在配置里带上 `wordOrder`，并且**首次点表导入时做一次合理性校验**：读到值超出量程上限就自动尝试其余三种，把结果记进日志，由人工确认后固化。这比现场逐个试要快。

## 别忽略寄存器地址的偏移习惯

Modbus 文档里写的 `40001` 对应协议里的 address `0`，`40002` 对应 `1`。有些厂家文档直接给协议地址（0 起），有些给寄存器编号（1 起）。如果读到的数整体偏移了一个寄存器，会表现为所有浮点数都"差一位"，看着像字节序问题，实际是地址基准不同。

先确认基准，再确认字节序，两个坑分开处理。
