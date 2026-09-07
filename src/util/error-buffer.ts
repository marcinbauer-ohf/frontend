export interface BufferedError {
  timestamp: string;
  source: "console" | "error" | "unhandledrejection";
  message: string;
}

const MAX_ENTRIES = 20;
const MAX_MESSAGE_LENGTH = 1000;

const buffer: BufferedError[] = [];
let installed = false;

const record = (source: BufferedError["source"], message: string) => {
  buffer.push({
    timestamp: new Date().toISOString(),
    source,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
  });
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
};

const stringify = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch (_err) {
    return String(value);
  }
};

/**
 * Installs a small ring buffer over console.error, window errors and unhandled
 * rejections. Only called when the beta feedback feature is enabled, so stable
 * builds never patch the console. Idempotent.
 */
export const installErrorBuffer = () => {
  if (installed) {
    return;
  }
  installed = true;

  // eslint-disable-next-line no-console
  const originalError = console.error;
  // eslint-disable-next-line no-console
  console.error = (...args: unknown[]) => {
    record("console", args.map(stringify).join(" "));
    originalError.apply(console, args);
  };

  window.addEventListener("error", (ev) => {
    record(
      "error",
      `${stringify(ev.error ?? ev.message)} @${ev.filename}:${ev.lineno}:${ev.colno}`
    );
  });

  window.addEventListener("unhandledrejection", (ev) => {
    record("unhandledrejection", stringify(ev.reason));
  });
};

export const getBufferedErrors = (): BufferedError[] => [...buffer];
