# Seed transactions

Drop any number of `.csv` files in this folder. On a **fresh database** the app
imports every `.csv` here as transaction history (one-time, on first run).

- The account each file is tagged with is derived from its filename:
  a name containing `cash`/`physical` → **Cash**, `bank`/`snb` → **Bank**,
  otherwise the filename is used.
- `.csv` files here are **gitignored** (they're personal data). See
  `example.csv.sample` for the expected column format (Dollarbird export style:
  `Date, Value, Label, Category, Description, …`). Any CSV with a date column and
  a `value`/`amount` column works.

To re-seed, stop the app, delete `../data/networth.db*`, and start again.
