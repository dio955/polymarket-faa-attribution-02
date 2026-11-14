# polymarket-faa-attribution-02

make.fun entry: forecast Polymarket's FAA outage attribution prices, minute by minute, 4 hours ahead, as five quantiles (5%, 25%, 50%, 75%, 95%) per market per minute.

## Model

Persistence median with a per-market adaptive spread. Each market gets its own sigma — the realised volatility of its 1-minute price changes over the last 120 minutes, floored at 0.0005 and capped at 0.005 per square-root minute. The median stays at the last price.

Backtest on the practice cases (NVIDIA CEO event, p00–p04, actual prices recovered from the overlapping next case): pinball loss 0.309962 vs the house baseline's 0.392518, about 21% better, and better in every case.

## Run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, standard library only, offline, deterministic.
