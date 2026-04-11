module.exports = {
  apps : [{
    name: 'KernelPulse',
    script: './backend/index.js',
    watch: false,
    env: {
      "KERNELPULSE_SERVER_PORT": 2800
    },
  }],
};
