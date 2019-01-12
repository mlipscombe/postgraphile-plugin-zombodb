[![Package on npm](https://img.shields.io/npm/v/postgraphile-plugin-zombodb.svg)](https://www.npmjs.com/package/postgraphile-plugin-zombodb)
[![CircleCI](https://circleci.com/gh/mlipscombe/postgraphile-plugin-zombodb/tree/master.svg?style=svg)](https://circleci.com/gh/mlipscombe/postgraphile-plugin-zombodb/tree/master)

# postgraphile-plugin-zombodb
This plugin implements a full text search operator for tables that have a
[ZomboDB](https://github.com/zombodb/zombodb) index, using [Elasticsearch](https://www.elastic.co/).

## Getting Started

### CLI

``` bash
postgraphile --append-plugins postgraphile-plugin-zombodb
```

See [here](https://www.graphile.org/postgraphile/extending/#loading-additional-plugins) for
more information about loading plugins with PostGraphile.

### Library

``` js
const express = require('express');
const { postgraphile } = require('postgraphile');
const PostGraphileZomboDBPlugin = require('postgraphile-plugin-zombodb');

const app = express();

app.use(
  postgraphile(pgConfig, schema, {
    appendPlugins: [
      PostGraphileZomboDBPlugin,
    ],
  })
);

app.listen(5000);
```

## Schema

The plugin discovers all `ZomboDB` indexes and adds a `search` input argument for
each table with an index.  For help with getting started with ZomboDB, check out the [tutorial](https://github.com/zombodb/zombodb/blob/master/TUTORIAL.md).

## Searching 

The plugin passes the search string directly to the ZomboDB extension.  See ZomboDB's [Query DSL documentation](https://github.com/zombodb/zombodb/blob/master/QUERY-DSL.md) for how to structure queries.

## Scoring

A `Float` score column will be automatically added to the GraphQL type for each indexed table, named `_score` by default.

This score field can be used for ordering and is automatically added to the orderBy
enum for the table.

## Examples

``` graphql
query {
  allPosts(
    search: {
      query: "+cat and +dog"
      minScore: 0.5
    }
    orderBy: _SCORE_DESC
  }) {
    ...
    _score
  }
}
```

## To Do

 * This plugin does not yet map `limit`/`offset` and `order by` parameters  into 
   [ZomboDB's query DSL](https://github.com/zombodb/zombodb/blob/master/QUERY-DSL.md),
   and so searches on huge tables may not be particularly performant.
 * Match highlighting.
 * Structured queries.
