// src/utils/cli.ts
import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import ora from "ora";

export const MODE = process.env.NODE_ENV || "development";
export const PORT = 3000;
export const TIMESTAMP = new Date().toLocaleString("en-US", {
  timeZone: "Europe/Paris",
  hour12: false,
});

export const showBanner = () => {
  figlet("SOCIAL BACKEND", (err, banner) => {
    if (err) {
      console.error(chalk.red("❌ Failed to load banner"));
      return;
    }

    const infoBox = boxen(
      `${chalk.greenBright("✔ Server is live")}\n` +
        `${chalk.blue("🌐 URL:")} http://localhost:${PORT}\n` +
        `${chalk.yellow("🧠 Mode:")} ${MODE}\n` +
        `${chalk.magenta("🕒 Started:")} ${TIMESTAMP}\n` +
        `${chalk.cyan("🔌 Modules:")} Fastify, Socket.IO\n`,
      {
        title: chalk.bold.cyan("SOCIAL BACKEND"),
        titleAlignment: "center",
        padding: 1,
        margin: 1,
        borderStyle: "double",
        borderColor: "green",
      }
    );

    console.log(infoBox);
  });
};

export const spinner = ora("🚀 Launching server...");
