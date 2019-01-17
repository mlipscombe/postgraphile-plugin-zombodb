const { graphql } = require('graphql');
const { withSchema } = require('./helpers');

// example schema taken from https://github.com/zombodb/zombodb/blob/master/TUTORIAL.md

test(
  'basic functionality works',
  withSchema({
    setup: `
      CREATE TABLE zombodb_test.products (
        id SERIAL8 NOT NULL PRIMARY KEY,
        name text NOT NULL,
        keywords varchar(64)[],
        short_summary text,
        long_description zdb.fulltext, 
        price bigint,
        inventory_count integer,
        discontinued boolean default false,
        availability_date date
      );

      CREATE INDEX idxproducts 
        ON zombodb_test.products 
        USING zombodb ((zombodb_test.products.*))
        WITH (url='${process.env.TEST_ELASTICSEARCH_URL || 'http://localhost:9200/'}');

      insert into zombodb_test.products values
        (1, 'Magical Widget', '{magical,widget,round}', 'A widget that is quite magical', 'Magical Widgets come from the land of Magicville and are capable of things you can''t imagine', 9900, 42, 'f', '2015-08-31'),
        (2, 'Baseball', '{baseball,sports,round}', 'It''s a baseball', 'Throw it at a person with a big wooden stick and hope they don''t hit it', 1249, 2, 'f', '2015-08-21'),
        (3, 'Telephone', '{communication,primitive,"alexander graham bell"}', 'A device to enable long-distance communications', 'Use this to call your friends and family and be annoyed by telemarketers.  Long-distance charges may apply', 1899, 200, 'f', '2015-08-11'),
        (4, 'Box', '{wooden,box,"negative space",square}', 'Just an empty box made of wood', 'A wooden container that will eventually rot away.  Put stuff it in (but not a cat).', 17000,0,'t','2015-07-01');
    `,
    test: async ({ schema, pgClient }) => {
      expect(schema).toMatchSnapshot();

      const result = await graphql(schema, `
        query {
          allProducts(
            search: {
              query: "sports box"
              minScore: 0
            }
            orderBy: [_SCORE_DESC]
          ) {
            nodes {
              id
              name
              _score
            }
          }
        }
      `, null, { pgClient });

      expect(result).not.toHaveProperty('errors');
      const { nodes } = result.data.allProducts;
      expect(nodes).toHaveLength(2);
    },
  }),
);

test(
  'query _score field without search works',
  withSchema({
    setup: `
      CREATE TABLE zombodb_test.products (
        id SERIAL8 NOT NULL PRIMARY KEY,
        name text NOT NULL,
        keywords varchar(64)[],
        short_summary text,
        long_description zdb.fulltext, 
        price bigint,
        inventory_count integer,
        discontinued boolean default false,
        availability_date date
      );

      create table zombodb_test.reviews (
        id serial not null primary key,
        product_id int8 not null references zombodb_test.products (id),
        review text
      );

      CREATE INDEX idxproducts 
        ON zombodb_test.products 
        USING zombodb ((zombodb_test.products.*))
        WITH (url='${process.env.TEST_ELASTICSEARCH_URL || 'http://localhost:9200/'}');

      insert into zombodb_test.products values
        (1, 'Magical Widget', '{magical,widget,round}', 'A widget that is quite magical', 'Magical Widgets come from the land of Magicville and are capable of things you can''t imagine', 9900, 42, 'f', '2015-08-31'),
        (2, 'Baseball', '{baseball,sports,round}', 'It''s a baseball', 'Throw it at a person with a big wooden stick and hope they don''t hit it', 1249, 2, 'f', '2015-08-21'),
        (3, 'Telephone', '{communication,primitive,"alexander graham bell"}', 'A device to enable long-distance communications', 'Use this to call your friends and family and be annoyed by telemarketers.  Long-distance charges may apply', 1899, 200, 'f', '2015-08-11'),
        (4, 'Box', '{wooden,box,"negative space",square}', 'Just an empty box made of wood', 'A wooden container that will eventually rot away.  Put stuff it in (but not a cat).', 17000,0,'t','2015-07-01');
      
      insert into zombodb_test.reviews values
        (1, 2, 'it is great');
    `,
    test: async ({ schema, pgClient }) => {
      expect(schema).toMatchSnapshot();

      const result = await graphql(schema, `
        query {
          allProducts {
            nodes {
              id
              name
              _score
              reviewsByProductId {
                nodes {
                  id
                  review
                }
              }
            }
          }
        }
      `, null, { pgClient });

      expect(result).not.toHaveProperty('errors');
      const { nodes } = result.data.allProducts;
      expect(nodes).toHaveLength(4);
    },
  }),
);
