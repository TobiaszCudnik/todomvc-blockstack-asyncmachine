# TodoMVC using Blockstack.js and AsyncMachine

Sample TodoMVC app with a **blockchain** and [Gaia](https://github.com/blockstack/gaia) backends featuring **sharing capabilities**.

Based on the [Redux TodoMVC](https://github.com/reduxjs/redux/tree/master/examples/todomvc) example, with the following changes:

1. Redux replaced with [AsyncMachine](https://github.com/TobiaszCudnik/asyncmachine)
1. `react-scripts` replaced with a dedicated `webpack` config (for CORS)
1. Authentication via a blockchain using [blockstack.js - Auth](https://github.com/blockstack/blockstack.js)
1. Data stored to Gaia via [blockstack.js - Storage](https://github.com/blockstack/blockstack.js)
1. Sharing using user-to-user keys and **multi-reader** storage (inspired by [blockstagram](https://medium.com/@stadolf/blockstagram-berlin-blockstack-hackathon-b65094079cb0))

## Usage

1. Add `todos.local` to your `/etc/hosts` file
	```bash
	127.0.0.1     todos.local
	```
1. Run `npm start`
1. Visit `http://todos.local:8080/`

For sharing you need to register a named Blockstack ID, eg `Alice.id`.
