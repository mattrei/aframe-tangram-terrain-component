module.exports = {
  entry: './index.js',
  module: {
    loaders: [{
      test: /\.yaml/,
            // exclude: /(node_modules)/,
      loader: 'yml-loader'
    }]
  }
};
