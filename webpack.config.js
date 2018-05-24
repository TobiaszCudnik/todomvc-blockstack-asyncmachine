const webpack = require("webpack")
const path = require("path")

module.exports = {
  entry: "./src/index.js",
  target: "web",
  output: {
    path: path.resolve("public/build"),
    filename: "index_bundle.js"
  },
  devServer: {
    contentBase: path.resolve("public"),
    historyApiFallback: {
      disableDotRule: true
    },
    watchOptions: { aggregateTimeout: 300, poll: 1000 },
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "X-Requested-With, content-type, Authorization"
    }
  },
  mode: "development",
  module: {
    rules: [
      // { test: /\.json$/, use: 'json-loader' },
      { test: /\.js$/, loader: "babel-loader", exclude: /node_modules/ },
      { test: /\.jsx$/, loader: "babel-loader", exclude: /node_modules/ },
      {
        test: /\.(eot|woff|woff2|ttf|svg|png|jpe?g|gif)(\?\S*)?$/,
        loader: "file-loader!url-loader"
      },
      { test: /\.css$/, loader: "style-loader!css-loader" }
    ]
  }
}
