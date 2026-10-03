# Changelog

## [0.1.0](https://github.com/bo0tzz/slopbonk/compare/v0.0.1...v0.1.0) (2026-10-03)


### Features

* act carries out blocks from the outbox; review records block and dismiss decisions ([4e54407](https://github.com/bo0tzz/slopbonk/commit/4e54407c31c9bbff386025171dad2e7b71ac9d84))
* backfill older comments and discussion replies, not just each thread's latest 100 ([ad32191](https://github.com/bo0tzz/slopbonk/commit/ad3219188cc9c3c365cb516dab6be3ae4f462c38))
* backfill repositories added to an installation after it was created ([cd3abbb](https://github.com/bo0tzz/slopbonk/commit/cd3abbba0251efa6c2c4bb44782c6f776d4361df))
* backfill the last 30 days of comments when an organisation installs the app ([596c560](https://github.com/bo0tzz/slopbonk/commit/596c560f1c2d8746158be0a40e9be874a772084e))
* daily retention cleanup applying ADR-0004's rules ([7612a22](https://github.com/bo0tzz/slopbonk/commit/7612a228b6e9ac49aa08a5f19b6316b100e1c7a8))
* database layer with sql-tools schema, generated migrations and mise tasks ([dcd1ec5](https://github.com/bo0tzz/slopbonk/commit/dcd1ec5762912847bcac959322a8f1688286dbf9))
* evaluate worker scoring accounts into cases, with re-checks and reopening ([bd33356](https://github.com/bo0tzz/slopbonk/commit/bd33356314439e8f12edb2ef3fa0230a32af0ad9))
* follow blocks and unblocks made on GitHub, and organisations renaming themselves ([622c5cc](https://github.com/bo0tzz/slopbonk/commit/622c5cc4a8f6ddf13c30b6e52ad0269de04ee4b3))
* GitHub webhook endpoint storing installations and comments, queueing evaluations ([28320e0](https://github.com/bo0tzz/slopbonk/commit/28320e003dff9e258f1a6a839e5a9f606bca4002))
* history fetch through the GitHub App, queued per account and installation ([86e41ec](https://github.com/bo0tzz/slopbonk/commit/86e41eca8a51d090be52b51b9728838ae636f9c5))
* open a case only when an account reaches the queue threshold ([79d2f6a](https://github.com/bo0tzz/slopbonk/commit/79d2f6aaa9ca18c34ba052a3fc1b3bd013000b7d))
* optionally hide the account's comments in the organisation when blocking ([b8effb9](https://github.com/bo0tzz/slopbonk/commit/b8effb9589a4f92c360c7ad1ec9085595c730edf))
* pg-boss job queue started from the server init hook ([729075c](https://github.com/bo0tzz/slopbonk/commit/729075c3cab35ea782539fb243c54bcdb5da0f0c))
* policy signals and the starting ruleset, tested on anonymised real accounts ([f3514df](https://github.com/bo0tzz/slopbonk/commit/f3514dfd1e887e4b70ae8291c01e39656a0fb076))
* review queue and account pages with evidence, activity chart, and block/dismiss decisions ([a7b731e](https://github.com/bo0tzz/slopbonk/commit/a7b731e1211049fb0d3e4c21c7afb352724775c1))
* reviewer sign-in with the GitHub token as session, and the dashboard home page ([9460343](https://github.com/bo0tzz/slopbonk/commit/946034356e252927c33fc42e9cf3ea37aafd4850))
* show whether blocks were carried out on GitHub ([cf63622](https://github.com/bo0tzz/slopbonk/commit/cf636222c3ca57013f1ff5a9c98b86dd21fb756d))
* stat-led queue cards with quick actions, structured account page, and dark mode ([0688c8a](https://github.com/bo0tzz/slopbonk/commit/0688c8aaf5ba1da102440b8ae47f15e16afbb6e0))


### Bug Fixes

* apply changed queue options to queues that already exist ([bf8ffad](https://github.com/bo0tzz/slopbonk/commit/bf8ffad5998ad2371bf229650615abe080c55202))
* compare hosts, not origins, when moving sign-in to the configured host ([d880e93](https://github.com/bo0tzz/slopbonk/commit/d880e9301dab80e1348b20858e17115ca58d450c))
* **deps:** update dependency @types/node to v26.6.4 ([#3](https://github.com/bo0tzz/slopbonk/issues/3)) ([a7549a9](https://github.com/bo0tzz/slopbonk/commit/a7549a9ac85e7db85b63eea9e61b2064abcfee49))
* drain queue backlogs back to back instead of one job per poll ([4783ecb](https://github.com/bo0tzz/slopbonk/commit/4783ecb279fc20e70bebb067ca5367e6d5d2a67b))
* drop the redundant heading above the account's score ([97401f8](https://github.com/bo0tzz/slopbonk/commit/97401f8a520e80a06ae61d7689ec55ed440b9d1a))
* label the block button without an ellipsis ([beba5aa](https://github.com/bo0tzz/slopbonk/commit/beba5aa20ba8e485b62ab9e1beb8c887aa7330d7))
* override cookie to 0.7 for the low-severity advisory SvelteKit 2 can't pick up ([0a235b1](https://github.com/bo0tzz/slopbonk/commit/0a235b149ae268eb570c702d5bf479076cbd7ce0))
* provide tooltip context for the theme switcher ([cba0e0c](https://github.com/bo0tzz/slopbonk/commit/cba0e0ca40e542d5b87c02e4a4b62924cafe0418))
* readable dashboard in dark mode, contained account page layout, and a dev-only reviewer session for screenshots ([77b3746](https://github.com/bo0tzz/slopbonk/commit/77b374620833ef3b880cb4b306feae227a8de4ba))
* restore a reviewer's account row when they decide, in case it has since been cleaned up ([c1f95c3](https://github.com/bo0tzz/slopbonk/commit/c1f95c378e8544fac2680b6071155179348b6bcd))
* share one token refresh between requests with the same expired session ([53e0d2f](https://github.com/bo0tzz/slopbonk/commit/53e0d2f1eef66d5f3520217745388d04fd83071a))
* start sign-in on the configured host, explain sign-in failures, and add the logo ([cc561cd](https://github.com/bo0tzz/slopbonk/commit/cc561cd4090c76d5add9501bf18f3a239cc7925b))


### Reverts

* drop following GitHub-side blocks; org_block needs the Administration permission ([d7315b8](https://github.com/bo0tzz/slopbonk/commit/d7315b8645b646e31f8cde99bdb17027cdbc4f17))
