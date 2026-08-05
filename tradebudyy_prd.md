# AI Trading Assistant PRD

**Version:** 2.0
**Status:** Planning
**Owner:** Personal Project
**Target Platform:** Web Application
**Primary Market:** US Stocks
**Investment Scope:** Shariah-Compliant Stocks Only

---

# 1. Vision

Build a personal AI-powered trading assistant that researches, analyzes, and recommends investments for Shariah-compliant US stocks.

The application acts as an intelligent investment analyst rather than an automated trader. It combines live market data, technical indicators, fundamentals, news, and portfolio risk to generate explainable Buy, Hold, Sell, or Watch recommendations.

The long-term objective is to improve investment decisions, reduce emotional trading, and continuously evaluate AI performance against actual market outcomes.

---

# 2. Objectives

* Research the US market automatically every trading day.
* Maintain a Shariah-compliant US stock universe.
* Generate explainable AI recommendations.
* Track portfolio performance daily.
* Record every investment decision.
* Measure AI recommendation accuracy.
* Build a long-term investing journal.
* Support optional broker integration in future versions.

---

# 3. Non Goals (Version 1)

The initial release will not include:

* Cryptocurrency
* Forex
* Malaysian Stocks
* Options
* Margin Trading
* Short Selling
* Multi-user support
* Public sharing
* Social features
* Automatic order execution

---

# 4. Technology Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui

## Backend

* Next.js Route Handlers
* Server Actions

## Database

* Supabase (PostgreSQL)

## ORM

* Prisma

## AI

* DeepSeek API (Primary)
* Claude API / OpenAI API (Optional/Future)

## Notifications

* Telegram Bot

## Scheduler

* Vercel Cron

## Charts

* TradingView Lightweight Charts

## Deployment

* Vercel

---

# 5. System Architecture

```text
                    Next.js Application
          Dashboard + API + Server Actions
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
    Supabase         Claude API      Market Data APIs
        │
        ▼
 AI Agent Pipeline
        │
        ▼
 Recommendation Engine
        │
        ▼
 Telegram Notifications
```

---

# 6. AI Agent Architecture

Instead of using one large AI prompt, the application separates responsibilities into specialized AI agents.

## Research Agent

Responsible for:

* Reading market news
* Summarizing earnings
* Tracking analyst upgrades
* Identifying catalysts
* Detecting investment risks

Output

* Market summary
* Bullish points
* Bearish points

---

## Technical Analysis Agent

Responsible for interpreting:

* EMA
* RSI
* MACD
* ATR
* Bollinger Bands
* Volume
* Support & Resistance
* Trend

Outputs

* Technical score
* Trend direction
* Technical reasoning

---

## Fundamental Analysis Agent

Responsible for analyzing

* Revenue Growth
* EPS
* Profit Margin
* Free Cash Flow
* Debt
* ROE
* PE
* PEG

Outputs

* Fundamental score
* Company health
* Valuation summary

---

## Risk Management Agent

Responsible for

* Portfolio exposure
* Sector allocation
* Position sizing
* Cash allocation
* Daily loss limits

Outputs

* Approve
* Reject
* Reduce Position

---

## Decision Agent

Combines every previous agent.

Outputs

* BUY
* HOLD
* SELL
* WATCH

Returns structured JSON containing:

* Recommendation
* Confidence
* Entry Price
* Stop Loss
* Take Profit
* Holding Period
* Investment Thesis
* Risk Level
* Supporting Reasons

---

# 7. Core Features

## Daily Market Research

Automatically collect

* Market indices
* Sector performance
* Economic calendar
* Earnings calendar
* Major financial news
* Analyst ratings
* Insider transactions

Generate

Daily AI Market Report.

---

## Shariah Stock Universe

Maintain an updated database of Shariah-compliant US stocks.

Each record includes

* Symbol
* Company
* Sector
* Industry
* Market Cap
* Shariah Status
* Last Updated

---

## Portfolio Manager

Track

* Cash
* Holdings
* Average Cost
* Current Price
* Market Value
* Portfolio Allocation
* Sector Allocation
* Dividend Income

Display

* Total Portfolio Value
* Today's Profit
* Weekly Profit
* Monthly Profit
* Total Profit
* Total Return %

---

## Portfolio Snapshot Engine

At the end of every US trading day, automatically create a portfolio snapshot.

Store

* Snapshot Date
* Cash Balance
* Portfolio Value
* Unrealized Profit
* Realized Profit
* Daily Profit
* Daily Return %
* Total Return %
* Open Positions
* Largest Winner
* Largest Loser

Purpose

Generate

* Daily Growth Chart
* Monthly Performance
* Yearly Performance
* Portfolio History
* Drawdown Analysis

---

## Trade Journal

Every trade stores

* Buy Date
* Sell Date
* Symbol
* Quantity
* Buy Price
* Sell Price
* Fees
* Realized Profit
* Holding Days
* AI Confidence
* AI Recommendation
* Investment Thesis
* Exit Reason
* Personal Notes

---

## AI Recommendation History

Every AI recommendation is stored regardless of whether a trade is executed.

Record

* Date
* Stock
* Recommendation
* Confidence
* Reasons
* User Decision
* Market Result After 1 Day
* Market Result After 7 Days
* Market Result After 30 Days

This enables measuring AI accuracy and comparing recommendations against actual outcomes.

---

## Dashboard

### Home

Display

* Portfolio Value
* Cash Balance
* Today's Profit/Loss
* Weekly Profit/Loss
* Monthly Profit/Loss
* Total Return
* Open Positions
* Top Gainers
* Top Losers
* Market Status
* AI Market Summary

---

### Watchlist

Display

* AI Score
* Technical Score
* Fundamental Score
* Sentiment Score
* Recommendation
* Confidence

---

### Portfolio

Display

* Holdings
* Allocation
* Profit/Loss
* Dividend History
* Risk Analysis

---

### Analytics

Charts

* Portfolio Growth
* Daily Profit
* Monthly Profit
* Total Return
* Portfolio Allocation
* Sector Allocation
* Win Rate
* AI Accuracy
* Realized vs Unrealized Profit

---

# 8. Daily Workflow

## Before Market Opens

* Refresh Shariah stock universe (when applicable)
* Fetch market news
* Fetch economic calendar
* Update earnings schedule
* Update analyst ratings

AI generates

Daily Market Report

---

## During Market Hours

* Update prices
* Update portfolio valuation
* Monitor watchlist
* Detect buy/sell opportunities
* Send Telegram alerts for high-confidence signals

---

## After Market Closes

* Refresh closing prices
* Calculate unrealized profit
* Calculate realized profit
* Generate daily portfolio snapshot
* Evaluate AI recommendations
* Generate daily portfolio report
* Send Telegram summary

---

# 9. Notifications

Telegram alerts

Examples

Strong Buy

Strong Sell

Major News

Earnings Tomorrow

Portfolio Risk Increased

Target Price Reached

Stop Loss Triggered

Daily Market Summary

Daily Portfolio Summary

---

# 10. Folder Structure

```text
app/
  (dashboard)/
  analysis/
  watchlist/
  portfolio/
  journal/
  analytics/
  settings/
  api/

components/

lib/
  ai/
    research/
    technical/
    fundamental/
    risk/
    decision/
  market/
  indicators/
  portfolio/
  shariah/
  telegram/
  scheduler/

prisma/
  schema.prisma

scripts/
  import-shariah/
  market-sync/
```

---

# 11. Roadmap

## Phase 1

* Portfolio tracking
* Daily market research
* Shariah stock database
* Technical analysis
* AI recommendations
* Telegram notifications

## Phase 2

* Fundamental analysis
* News summarization
* Portfolio analytics
* Trade journal
* AI recommendation history

## Phase 3

* Paper trading
* Backtesting
* AI performance scoring
* Portfolio optimization

## Phase 4

* Broker integration (if supported)
* One-click order preparation
* Optional automated execution with configurable risk controls

---

# 12. Success Metrics

The project is considered successful when it can:

* Produce a daily AI market report before each trading session.
* Generate explainable investment recommendations.
* Record accurate daily portfolio snapshots.
* Track realized and unrealized profit over time.
* Measure AI recommendation accuracy.
* Maintain a complete investment journal.
* Reduce emotional decision-making through structured analysis.

---

# 13. Guiding Principles

* AI assists the investor; it does not replace judgment.
* Every recommendation must be explainable.
* Risk management always overrides AI recommendations.
* All decisions should be traceable and reproducible.
* Record everything: market data, AI output, trades, and portfolio history.
* Prefer modular AI agents over one monolithic prompt.
* Keep the architecture simple, maintainable, and extensible.
