import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://yiyiqinzdilnnqqrepkm.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpeWlxaW56ZGlsbm5xcXJlcGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTU0MDksImV4cCI6MjA5NjA5MTQwOX0.yYfPoQycUUZICKr3eK9OpJVbtOAyArh3UaCI6uHtSQQ"
);

// Get kontakte schema
const { data, error } = await sb
  .from("kontakte")
  .select("*");

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
}

console.log("Total records:", data.length);
if (data && data.length > 0) {
  console.log("Kontakte columns:", Object.keys(data[0]));
  console.log("\nFirst record:");
  console.log(data[0]);
} else {
  console.log("No kontakte records found");
}
