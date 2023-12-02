# Website Scripts

These are some scripts that I use to make websites a bit quicker.

## envgen

Generates `.env` files super quick, for multiple environments, based on a
`.env.example` file.

### `.env.example` example

```sh
#@ string
#@ reflect(service = web): NEXT_PUBLIC
#@ reflect(service = cms): PAYLOAD_PUBLIC
#@ env: dev, prod
#@ ask
SITE_NAME="The sites name"

#@ secret
#@ service: cms
#@ env: dev, prod
PAYLOAD_SECRET="The Payload CMS secret"

#@ port
#@ service: cms
#@ env: dev
CMS_PORT="The port the CMS will use"

#@ url
#@ service: cms
#@ default: http://localhost:${CMS_PORT}
#@ reflect(service = web): NEXT_PUBLIC
#@ env: dev, prod
#@ ask: prod
CMS_URL="The base URL for the CMS"

#@ url
#@ default: http://localhost:3000
#@ reflect(service = web): NEXT_PUBLIC
#@ reflect(service = cms): PAYLOAD_PUBLIC
#@ env: dev, prod
#@ ask: prod
WEB_URL="The base URL for the web"
```

Basically, any valid `.env.example` is a valid template for envgen, but using
`#@` comments, you can tell the tool how to process the environment variables
and generate values. For the example above, when running
`envgen gen .env.example -env dev -service web`, you would get prompted for the
value of `SITE_NAME`, a free port would be used for `CMS_PORT`, `CMS_URL` would
be inferred, `WEB_URL` would be the default localhost url but only
`NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_CMS_URL` and `NEXT_PUBLIC_WEB_URL` would
actually be included in the final output.

This way, new `.env` files can be generated super quick with included
documentation as to how variables are supposed to be utilized.

## assetgen

Generates React components, CSS variables, favicons and more based off a
`colors.json` and `source-*.svg` files. Simply run `assetgen -i assets-folder`
and get a directory with the processed files.

## License

MIT
