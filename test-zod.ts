import { z } from "zod";
const schema = z.object({
  error: z.array(z.string()),
  result: z.record(
    z.string(), 
    z.array(z.array(z.union([z.number(), z.string()])))
  ).and(z.object({ last: z.number() }))
});
const data = {
  error: [],
  result: {
    "XXBTZUSD": [[1, "2"]],
    "last": 123
  }
};
console.log(JSON.stringify(schema.safeParse(data), null, 2));
