# Self-hosted fonts

Served from the app through `next/font/local` (see `src/theme/fonts.ts`). No CDN (CLAUDE.md §2 rule 9).

| File | Family | Version | Source | License | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `Vazirmatn-Variable.woff2` | Vazirmatn (fa) | v33.003 | https://github.com/rastikerdar/vazirmatn/releases/tag/v33.003 (`fonts/webfonts/Vazirmatn[wght].woff2`, renamed) | SIL OFL 1.1, `Vazirmatn-OFL.txt` | `4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92` |
| `InterVariable.woff2` | Inter (en) | v4.1 | https://github.com/rsms/inter/releases/tag/v4.1 (`web/InterVariable.woff2`) | SIL OFL 1.1, `Inter-OFL.txt` | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |

The files are unmodified (no subsetting), so the OFL Reserved Font Name clauses do not apply.

Updating: download the release zip from the official GitHub release, copy the variable `woff2`
and the license file, update this table, and re-check Persian digits and ZWNJ in `/dev/gallery`.
