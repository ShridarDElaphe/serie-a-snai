import { refresh } from "../lib/ingest/refresh";

refresh("startup")
  .then(() => {
    console.log("aggiornamento completato");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
