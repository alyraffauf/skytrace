# Frequently asked questions

## What is SkyTrace?

SkyTrace is a free and open source viewer for public Bluesky and AT Protocol moderation records. You can look up an account's labels, log of moderator actions, blocks, lists, and so on without signing in. It does not and cannot access private messages or account credentials.

## How does SkyTrace show blocks and list memberships?

Bluesky is built on the AT Protocol, which is decentralized. Accounts publish records on their hosting servers, and services across the network can read those public records. Posts, blocks, and list memberships are part of this public data. Blocking someone on Bluesky limits interactions; it does not make your published records private.

The AT Protocol team explains this in [Why are blocks on Bluesky public?](https://atproto.com/blog/block-implementation) and its [protocol overview](https://atproto.com/guides/overview).

For a broader introduction, Dan Abramov's [Open Social](https://overreacted.io/open-social/) explains the ideas behind AT Protocol.

## Why do I have labels on my account?

Since Bluesky is decentralized, moderation works differently than other social networks. In addition to Bluesky, the company, there are other moderation services users may subscribe to. Some of these services are very large, and some are very small, with few users.

Additionally, labels can be used to share additional information with users, such as your pronouns. Some of these are opt-in, others are applied by labeler operators.

Bluesky explains how independent labelers work in [its guide to stackable moderation](https://bsky.social/about/blog/03-12-2024-stackable-moderation).

## Where does the data come from?

When you visit SkyTrace, your browser requests data directly from public services on the AT Protocol. Posts, owned lists, and outgoing blocks come from the account's hosting server. The contents of lists, posts, etc. come directly from the server that hosts that account.

## Does SkyTrace keep a copy of my data?

SkyTrace does not run a content index or archive. Data is fetched as needed. It keeps fetched records in a temporary cache to avoid repeating requests. SkyTrace does not save those records to a database or browser storage.

Your browser may cache downloaded files, and the services SkyTrace queries have their own caches and retention policies. SkyTrace does not control those copies.

<!-- if opt-out-enabled -->

## How do I opt out?

Block [SkyTrace's Bluesky account]({{optOutAccountUrl}}). SkyTrace will then hide your profile page from view. SkyTrace also hides profiles blocked by its own account. Unblocking allows your profile to appear again, provided SkyTrace has not blocked you.

This opt-out controls whether your profile appears on SkyTrace; it does not delete public records or remove them from other services, individual list pages, or other accounts' records.

<!-- endif -->

## Which lists appear on Listed On?

Listed On starts with public records that add the account to a list. SkyTrace then loads each list to show its details. A list's owner controls its membership and description. Inclusion does not mean SkyTrace endorses the list or its claims.

<!-- if minimum-enabled -->

Not all moderation lists are created equal. Many have few, if any, subscribers. SkyTrace shows moderation lists only when at least {{minimumBlocking}} {{blockingAccounts}} the list. If the count cannot be loaded, SkyTrace withholds the list and shows a membership error.

The minimum applies only to moderation lists on Listed On. Curation lists remain visible, and the rule does not restrict direct list pages. A blocker count measures use of a list, not whether its contents are accurate or fair.

<!-- endif -->

## Why is something missing or out of date?

Servers and indexes update at different times. Records may be deleted, services may be unavailable, and results load in pages. An empty result is not proof that a record never existed. Refresh or retry after a short wait if something looks wrong.

SkyTrace also respects the profile's request to hide posts from logged-out viewers by default. This affects Feed and Labeled posts, rather than making the underlying public records private.
