export interface OHLCV {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function ema(values: number[], period: number): number[] {
  throw new Error(`ema not implemented (period ${period})`);
}

export function rsi(values: number[], period = 14): number[] {
  throw new Error(`rsi not implemented (period ${period})`);
}

export function macd(values: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
  throw new Error("macd not implemented");
}

export function atr(candles: OHLCV[], period = 14): number[] {
  throw new Error(`atr not implemented (period ${period})`);
}

export function bollingerBands(values: number[], period = 20, stdDev = 2): { upper: number[]; middle: number[]; lower: number[] } {
  throw new Error(`bollingerBands not implemented (period ${period}, stdDev ${stdDev})`);
}
