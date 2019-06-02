module.exports = {
  entry: './index.js',
  module: {
    loaders: [{
      test: /\.yaml$/,
            // exclude: /(node_modules)/,
      loader: 'yml-loader'
    },
    {
      test: /\.css$/, 
      loader: "style-loader!css-loader"
    },
    {
      test: /\.png$/,
      loader: 'url-loader',
      query: { mimetype: 'image/png' }
    }
    ],
  }
};
