// theme.config.js
export default {
  project: {
    link: 'https://github.com/MonetDB/monetdb-nodejs',
  },
  docsRepositoryBase: 'https://github.com/MonetDB/monetdb-nodejs/blob/master/docs', // base URL for the docs repository
  darkMode: true,
  footer: true,
  navigation: {
    prev: true,
    next: true,
  },
  footer: {
    text: `Mozilla Public License, v.2.0 ${new Date().getFullYear()}`,
  },
  editLink: {
    text: 'Edit this page on GitHub',
  },
  logo: (
    <>
      <span>monetdb-nodejs</span>
    </>
  ),
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="MonetDB Node.js connector"
      />
      <meta name="og:title" content="monetdb-nodejs" />
      <meta name="og:description" content="MonetDB Node.js driver" />
    </>
  ),
}
