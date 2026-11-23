---
title: 'SQL Server 事务日志满了：不是加盘，是看恢复模式'
description: '一台采集库突然写入失败，报 9002 日志已满。多数时候不是日志长得太快，而是恢复模式让日志根本没有机会被截断。'
pubDate: 2026-10-21
tags: ['SQL', 'DEBUG', '.NET']
---

现场数据库写入报错 `9002: The transaction log for database is full`。这类问题很容易被简化成"日志文件不够大，加磁盘"，但加了 100G 之后两天又满，说明日志被某种机制一直保留着。

## 先看三个值

```sql
SELECT name, recovery_model_desc, log_reuse_wait_desc
FROM sys.databases
WHERE name = 'YourDb';
```

`log_reuse_wait_desc` 是诊断的核心，它告诉你日志"为什么不能被截断"：

| 值 | 含义 | 处理方向 |
| --- | --- | --- |
| `NOTHING` | 无阻塞 | 日志仍增长说明事务量大或有长事务 |
| `LOG_BACKUP` | 在等日志备份 | 完整恢复模式但没做日志备份 |
| `ACTIVE_TRANSACTION` | 有长事务未提交 | 找那个事务 |
| `REPLICATION` / `AVAILABILITY_REPLICA` | 同步受阻 | 查复制或副本状态 |

如果看到 `LOG_BACKUP`，而运维从来没配过日志备份，那结论很清楚：库处在 FULL 恢复模式，日志永远不会自动截断，只能等日志备份。

## 采集类库的正确姿势

用于采集、报表、不需要时间点恢复的库，用 SIMPLE 恢复模式就够了：

```sql
ALTER DATABASE YourDb SET RECOVERY SIMPLE;
DBCC SHRINKFILE (YourDb_Log, 1024); -- 收缩到 1G，留余量
```

切成 SIMPLE 后，日志在事务提交后即可被重用，不会因为"没有备份"而无限增长。注意 `SHRINKFILE` 只在确实需要回收空间时做，频繁收缩会造成碎片。

## 需要完整恢复模式的场景

如果业务上必须能恢复到任意时间点，那就不能切 SIMPLE，而是**配日志备份并定期截断**：

```sql
BACKUP LOG YourDb TO DISK = 'D:\backup\log.trn' WITH INIT, COMPRESSION;
```

频次要跟日志增长速度匹配。一个经验值：日志每小时增长 1G，就至少每小时备份一次，否则两次备份之间已经满了。

## 顺手要做的两件事

1. **给日志文件设上限**：不设 `MAXSIZE` 的话，它会一直长到把磁盘吃光，最后影响整台机器
2. **压测长事务**：采集服务里如果有"一次批量导入几万条点表"的操作，那是一条长事务，日志在它提交前无法截断。拆成小批次提交比调大日志有效得多

```csharp
// 批量写入分批提交，避免单条长事务撑爆日志
foreach (var chunk in rows.Chunk(500))
{
    await using var tx = await conn.BeginTransactionAsync();
    // ...insert chunk...
    await tx.CommitAsync();
}
```

结论：日志满先查 `log_reuse_wait_desc`，再决定是切恢复模式、补日志备份，还是拆长事务。单纯加盘只是把问题推迟两天。
