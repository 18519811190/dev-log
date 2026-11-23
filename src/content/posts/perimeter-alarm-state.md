---
title: '周界报警跨天就丢记录：状态机与日期边界'
description: '报警主机凌晨上报的状态，业务库里第二天的统计永远是空的。问题不在采集，而在状态机把"当天"当日历天来算。'
pubDate: 2026-11-12
tags: ['.NET', 'TASK', 'DEBUG']
series: '现场复盘'
---

现场反馈：周界报警的日报里，凌晨 0 点到 6 点的记录经常整段缺失；有时候同一条报警会在两天各出现一次。采集服务本身在跑，设备也在上报，问题出在状态落库这一层。

## 现象拆解

报警主机的上报是**状态快照**而不是事件流：每隔一段时间告诉你"当前 1~8 防区分别是什么状态"。业务侧要把它转成"某防区某时段处于报警"的记录，于是必然要处理：

1. 状态没变化时，是更新上一条的结束时间，还是新插一条
2. 跨零点时，上一条属于昨天还是今天
3. 撤防后重新布防，算不算新一段

原来的实现用了 `DateTime.Today` 做分组键：

```csharp
// 错误示范：用日历天做分组，跨零点直接断档
var day = DateTime.Today;
if (lastState?.Day != day) { /* 新开一条记录 */ }
```

凌晨 0 点一过，`DateTime.Today` 变了，代码立刻结束上一条并新开一条，于是昨天那段被截断在 00:00，今天的统计又从 0 点开始，前后都不连续。更糟的是主机有几百毫秒的重传，同一状态会在两天各落一条。

## 正确的模型：状态区间，不是按天切

把记录理解成**带开始时间和结束时间的区间**，日期只是查询时的投影，不参与写入判断：

```csharp
public sealed class AlarmInterval
{
    public string ZoneNo { get; init; }
    public DateTime StartUtc { get; init; }
    public DateTime? EndUtc { get; set; }
    public int State { get; init; }
}
```

写入逻辑变成三条规则：

- 状态与当前开区间一致：什么都不做，只刷新"最后确认时间"
- 状态变化：把当前区间 `EndUtc` 置为本次上报时间，再开一条新区间
- 超过 N 个采集周期没有上报：视为数据中断，强制闭合并标记 `Gap = true`，不要静默延长

这样跨零点不需要任何特殊处理，区间自然穿过 00:00。

## 查询时再按天切

日报要按本地日历天统计，就在查询层拆：

```sql
-- 把区间与当天窗口求交集，再算时长
select zone_no,
       sum(datediff(second,
           case when start_utc < @dayStart then @dayStart else start_utc end,
           case when end_utc   > @dayEnd   then @dayEnd   else end_utc   end)) as seconds
from alarm_intervals
where start_utc < @dayEnd and (end_utc is null or end_utc > @dayStart)
group by zone_no;
```

时间段落在两天，两天各算各的那一段，加起来正好是总时长，既不会丢也不会重复。

## 时间基准统一用 UTC

库内存 UTC，展示时按业务时区转换。混用本地时间和 UTC 是这类问题最常见的放大器：采集端在服务器时区，前端在浏览器时区，报表服务又读数据库默认值，三者任何一个不一致，"跨天"就变成随机事件。

## 检查清单

- 写入用区间，不用日历天分组
- 状态未变只更新确认时间，不新插
- 超时未上报要显式标记缺口
- 存 UTC，按查询时区投影
- 重传做幂等：同一 `(ZoneNo, State, StartUtc)` 唯一约束
