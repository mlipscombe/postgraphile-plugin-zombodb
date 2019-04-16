module.exports = function PostGraphileZomboDBPlugin(
  builder,
  { zomboInputFieldName = 'search', zomboScoreFieldName = '_score' } = {},
) {
  builder.hook('inflection', (inflection, build) =>
    build.extend(inflection, {
      pgZomboInputField() {
        return zomboInputFieldName;
      },
      pgZomboScoreField() {
        return zomboScoreFieldName;
      },
      pgZomboFilterType() {
        return 'SearchQuery';
      },
      pgOrderByScoreAscEnum() {
        return this.constantCase(`${this.pgZomboScoreField()}_asc`);
      },
      pgOrderByScoreDescEnum() {
        return this.constantCase(`${this.pgZomboScoreField()}_desc`);
      },
    }),
  );

  builder.hook('build', (build) => {
    const {
      pgIntrospectionResultsByKind: introspectionResultsByKind,
      pgOmit: omit,
    } = build;
    const pgZomboTables = {};

    const zomboExtension = introspectionResultsByKind.extension.find(
      (e) => e.name === 'zombodb',
    );
    if (!zomboExtension) {
      return build;
    }

    introspectionResultsByKind.index.forEach((idx) => {
      if (idx.indexType !== 'zombodb') return;
      if (omit(idx, 'zombodb')) return;
      if (!idx.class.namespace) return;

      const table = idx.class;
      if (!table.namespace || !table.isSelectable || omit(idx, 'read')) {
        return;
      }

      pgZomboTables[table.id] = idx;
    });

    return build.extend(build, {
      pgZomboTables,
    });
  });

  builder.hook('init', (_, build) => {
    const {
      newWithHooks,
      graphql: {
        GraphQLInputObjectType,
        GraphQLString,
        GraphQLNonNull,
        GraphQLFloat,
      },
      inflection,
      pgZomboTables,
    } = build;

    if (!pgZomboTables) {
      return _, build;
    }

    newWithHooks(
      GraphQLInputObjectType,
      {
        description:
          'A full text search filter to be used against a collection.',
        name: inflection.pgZomboFilterType(),
        fields: {
          query: {
            description: 'The query to search for in the collection.',
            type: new GraphQLNonNull(GraphQLString),
          },
          minScore: {
            description: 'The minimum score to return.',
            type: GraphQLFloat,
          },
        },
      },
      {
        isPgZomboFilter: true,
      },
    );

    return _, build;
  });

  builder.hook(
    'GraphQLObjectType:fields:field:args',
    (args, build, context) => {
      const {
        extend,
        pgSql: sql,
        getTypeByName,
        inflection,
        pgZomboTables,
      } = build;

      const {
        scope: {
          isPgFieldConnection,
          isPgFieldSimpleCollection,
          pgFieldIntrospection: source,
        },
        addArgDataGenerator,
        field,
        Self,
      } = context;

      const shouldAddSearch = isPgFieldConnection || isPgFieldSimpleCollection;
      if (!shouldAddSearch || !pgZomboTables[source.id]) {
        return args;
      }

      const inputFieldName = inflection.pgZomboInputField();
      const filterTypeName = inflection.pgZomboFilterType();
      const FilterType = getTypeByName(filterTypeName);

      addArgDataGenerator((input) => ({
        pgDontUseAsterisk: true,
        pgQuery: (queryBuilder) => {
          if (!input[inputFieldName]) return;

          const { query, minScore } = input[inputFieldName];

          // TODO: translate limit/offset/orderBy into QueryDSL to improve performance.

          // const { limit, offset, flip } = queryBuilder.getFinalLimitAndOffset();
          // const orderBy = queryBuilder.getOrderByExpressionsAndDirections();
          // console.log(orderBy[0][0]);

          const dsl = minScore
            ? sql.fragment`dsl.min_score(${sql.value(minScore)}, ${sql.value(
                query,
              )})`
            : sql.value(query);

          const where = sql.fragment`
          ${queryBuilder.getTableAlias()} ==> ${dsl}
        `;
          queryBuilder.where(where);
        },
      }));

      return extend(
        args,
        {
          [inputFieldName]: {
            description: 'A search string used to filter the collection.',
            type: FilterType,
          },
        },
        `Adding ZomboDB search arg to field '${field.name} of '${Self.name}'`,
      );
    },
  );

  builder.hook('GraphQLObjectType:fields', (fields, build, context) => {
    const {
      graphql: { GraphQLFloat },
      pg2gql,
      pgSql: sql,
      inflection,
      pgZomboTables,
    } = build;

    const {
      scope: { isPgRowType, isPgCompoundType, pgIntrospection: table },
      fieldWithHooks,
    } = context;

    if (
      !(isPgRowType || isPgCompoundType) ||
      !table ||
      table.kind !== 'class' ||
      !pgZomboTables[table.id]
    ) {
      return fields;
    }

    const scoreFieldName = inflection.pgZomboScoreField();

    return Object.assign({}, fields, {
      [scoreFieldName]: fieldWithHooks(
        scoreFieldName,
        ({ addDataGenerator }) => {
          addDataGenerator(({ alias }) => ({
            pgDontUseAsterisk: true,
            pgQuery: (queryBuilder) => {
              queryBuilder.select(
                sql.fragment`zdb.score(${queryBuilder.getTableAlias()}.ctid)`,
                alias,
              );
            },
          }));
          return {
            description: 'Full-text search score.',
            type: GraphQLFloat,
            resolve: (data) => pg2gql(data[scoreFieldName], GraphQLFloat),
          };
        },
        {
          isPgZomboDBVRankField: true,
        },
      ),
    });
  });

  builder.hook('GraphQLEnumType:values', (values, build, context) => {
    const { extend, pgSql: sql, inflection, pgZomboTables } = build;

    const {
      scope: { isPgRowSortEnum, pgIntrospection: table },
    } = context;

    if (!isPgRowSortEnum || !table || !pgZomboTables[table.id]) {
      return values;
    }

    const ascFieldName = inflection.pgOrderByScoreAscEnum();
    const descFieldName = inflection.pgOrderByScoreDescEnum();
    const findExpr = ({ queryBuilder }) =>
      sql.fragment`zdb.score(${queryBuilder.getTableAlias()}.ctid)`;

    return extend(
      values,
      {
        [ascFieldName]: {
          value: {
            alias: `${ascFieldName.toLowerCase()}`,
            specs: [[findExpr, true]],
          },
        },
        [descFieldName]: {
          value: {
            alias: `${descFieldName.toLowerCase()}`,
            specs: [[findExpr, false]],
          },
        },
      },
      `Adding ZomboDB score columns for sorting on table '${table.name}'`,
    );
  });
};
