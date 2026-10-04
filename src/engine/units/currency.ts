import { CalcError, D } from '../values';
import { dim } from './dims';
import type { UnitSpec } from './registry';
import type { UnitContext } from './types';

const CURRENCY = dim({ currency: 1 });
export const BASE_CURRENCY = 'USD';

/** ISO 4217 codes with published rates. Matched in uppercase (`TRY`, `ALL`). */
const ISO_CODES =
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLF CLP CNH CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP FOK GBP GEL GGP GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS IMP INR IQD IRR ISK JEP JMD JOD JPY KES KGS KHR KID KMF KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TVD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XDR XOF XPF YER ZAR ZMW ZWG ZWL'.split(
    ' ',
  );

/**
 * Codes that also match in lowercase. Others need uppercase, because many codes are English
 * words ("all", "top", "cup", "mad", "pen").
 */
const LOWERCASE_CODES = new Set(
  'usd eur gbp jpy cny inr chf cad aud nzd hkd sgd sek nok dkk pln czk huf mxn brl krw zar rub ils thb myr idr vnd aed sar ars clp cop twd'.split(
    ' ',
  ),
);

/** Symbols written before (or after) the amount. */
const SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  '₺': 'TRY',
  '₪': 'ILS',
  '₫': 'VND',
  '₴': 'UAH',
  '₦': 'NGN',
  '฿': 'THB',
  '₱': 'PHP',
  '₿': 'BTC',
};
export const CURRENCY_SYMBOL_CHARS = Object.keys(SYMBOLS);

const NAMES: Record<string, string> = {
  USD: 'dollar, dollars, buck, bucks, us dollar, us dollars',
  EUR: 'euro, euros',
  GBP: 'pound sterling, pounds sterling, british pound, british pounds, quid',
  JPY: 'yen, japanese yen',
  CNY: 'yuan, renminbi, rmb, chinese yuan',
  INR: 'rupee, rupees, indian rupee, indian rupees',
  CHF: 'franc, francs, swiss franc, swiss francs',
  CAD: 'canadian dollar, canadian dollars',
  AUD: 'australian dollar, australian dollars',
  NZD: 'new zealand dollar, new zealand dollars',
  HKD: 'hong kong dollar, hong kong dollars',
  SGD: 'singapore dollar, singapore dollars',
  MXN: 'peso, pesos, mexican peso, mexican pesos',
  BRL: 'reais, brazilian real, brazilian reais',
  KRW: 'won, korean won',
  RUB: 'ruble, rubles, rouble, roubles',
  TRY: 'lira, turkish lira',
  SEK: 'krona, swedish krona, swedish kronor',
  NOK: 'krone, norwegian krone, norwegian kroner',
  DKK: 'danish krone, danish kroner',
  PLN: 'zloty, zlotys',
  ZAR: 'rand',
  ILS: 'shekel, shekels',
  THB: 'baht',
  VND: 'dong',
  MYR: 'ringgit',
  IDR: 'rupiah',
  AED: 'dirham, dirhams',
  SAR: 'riyal, riyals',
};

/** Crypto tickers, their CoinGecko ids, and names. */
export const CRYPTO: Record<string, { id: string; names: string }> = {
  BTC: { id: 'bitcoin', names: 'bitcoin, bitcoins' },
  ETH: { id: 'ethereum', names: 'ether, ethereum' },
  SOL: { id: 'solana', names: 'solana' },
  DOGE: { id: 'dogecoin', names: 'dogecoin, dogecoins' },
  LTC: { id: 'litecoin', names: 'litecoin, litecoins' },
  XRP: { id: 'ripple', names: 'ripple' },
  ADA: { id: 'cardano', names: 'cardano' },
  USDT: { id: 'tether', names: 'tether' },
  USDC: { id: 'usd-coin', names: '' },
};

export function isCrypto(code: string): boolean {
  return code in CRYPTO;
}

/** Factor to USD: 1 unit of `code` is worth 1 / rate dollars. */
function currencyFactor(code: string, scale = 1) {
  return (ctx: UnitContext) => {
    if (code === BASE_CURRENCY) return new D(scale);
    const rate = ctx.rates?.[code];
    if (!rate) throw new CalcError(`No exchange rate for ${code}`);
    ctx.onRate?.();
    return new D(scale).div(rate);
  };
}

function currency(code: string, names = '', symbols: string[] = []): UnitSpec {
  const crypto = isCrypto(code);
  return {
    def: {
      id: code,
      symbol: code,
      dim: CURRENCY,
      factor: currencyFactor(code),
      currency: code,
      crypto,
      prefix: true,
    },
    symbols: [code, ...symbols],
    names: [
      ...(LOWERCASE_CODES.has(code.toLowerCase()) || crypto ? [code.toLowerCase()] : []),
      ...names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean),
    ],
  };
}

const symbolsFor = (code: string) =>
  Object.entries(SYMBOLS)
    .filter(([, c]) => c === code)
    .map(([s]) => s);

export const CURRENCY_UNITS: UnitSpec[] = [
  ...ISO_CODES.map((code) => currency(code, NAMES[code], symbolsFor(code))),
  ...Object.entries(CRYPTO).map(([code, { names }]) => currency(code, names, symbolsFor(code))),
  {
    def: {
      id: 'sat',
      symbol: 'sat',
      plural: 'sats',
      dim: CURRENCY,
      factor: currencyFactor('BTC', 1e-8),
      crypto: true,
    },
    symbols: [],
    names: ['sat', 'sats', 'satoshi', 'satoshis'],
  },
];
