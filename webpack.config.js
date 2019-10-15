const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const mode = process.env.NODE_ENV || 'development';
const prod = mode === 'production';

const IMG = path.resolve(__dirname, 'img');
const PUBLIC = path.resolve(__dirname, 'public');

module.exports = [
  {
    mode: 'development',
    devServer: {
      contentBase: PUBLIC,
      port: 8010,
    },

    entry: {
      bundle: ['./src/main.js']
    },
    output: {
      path: PUBLIC,
      filename: '[name].js',
      chunkFilename: '[name].[id].js'
    },
    module: {
      rules: [
        {
	  test: /\.css$/,
	  use: [
	    /**
	     * MiniCssExtractPlugin doesn't support HMR.
	     * For developing, use 'style-loader' instead.
	     * */
	    prod ? MiniCssExtractPlugin.loader : 'style-loader',
	    'css-loader'
	  ]
        },
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css'
      }),
    ],
    devtool: 'source-map'
  },
  {
    mode: 'development',
    entry: {
      dataTest: './src/dataTest.js',
    },
    output: {
      path: PUBLIC,
      filename: '[name].js',
    },
  }
];

