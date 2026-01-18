import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

interface Config {
  verbose: boolean;
  agents: string[];
}

const DEFAULT_AGENTS: string[] = ["claude", "codex", "gemini"];

const DEFAULT_CONFIG: Config = {
  verbose: false,
  agents: DEFAULT_AGENTS,
};

let config: Config = { ...DEFAULT_CONFIG };

export function loadConfigFromFile(
  cwd: string = process.cwd()
): Partial<Config> {
  const configPath = join(cwd, "baton.config.yaml");

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return parse(content) ?? {};
  } catch (error) {
    console.warn(`Failed to load config from ${configPath}:`, error);
    return {};
  }
}

export function initConfig(cliOptions: Partial<Config> = {}): void {
  const fileConfig = loadConfigFromFile();
  config = { ...DEFAULT_CONFIG, ...fileConfig, ...cliOptions };
}

export function setConfig(options: Partial<Config>): void {
  Object.assign(config, options);
}

export function getConfig(): Readonly<Config> {
  return config;
}
