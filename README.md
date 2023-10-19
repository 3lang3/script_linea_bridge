# Linea 官方桥脚本

## 运行

- `pks.txt` 私钥列表，一行一个

```bash
npn i -g pnpm # 安装依赖管理工具
pnpm install # 安装依赖
```

## 空投

在 `airdrop.ts` 中配置好 `privateKey` 和 `amount` 需要空投的数量

```bash
pnpm task airdrop.ts # 开始空投
```

## 跨链

```bash
# linea-goerli跨0.1eth到goerli
pnpm task -e test -a to_mainet -n 0.1

# 目前官方桥从linea跨到主网需要手动领取确认, 这一步需要在等待一定时间后(30min)再执行
pnpm task -e test -a claim 
```

内置任务缓存，如果任务失败，可以重新执行，已执行的不会重复执行

```bash
# 清空任务缓存
pnpm task -a reset
```
