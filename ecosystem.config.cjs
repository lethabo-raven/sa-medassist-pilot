module.exports = {
  apps: [
    {
      name: "sa-medassist-api",
      cwd: "/opt/sa-medassist-pilot",
      script: "server/src/index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "4100",
        DOTENV_CONFIG_PATH: "/etc/sa-medassist/sa-medassist.env"
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "350M",
      kill_timeout: 10000,
      listen_timeout: 10000
    }
  ]
};
