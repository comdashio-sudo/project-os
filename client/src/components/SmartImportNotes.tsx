// Q-66 (4) (I3 28-11): the smart reader's notes on a file, in the screen's language (never the raw code); a note the list does not know is shown as written.
import React from "react";
import type { Language } from "@/lib/language";
import { smartNoteText } from "@shared/smartImportNotes";

export function SmartImportNotes({ notes, language, title }: { notes: readonly string[] | undefined; language: Language; title: string }) {
  if (!notes?.length) return null;
  return (
    <div data-smart-notes>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-1 list-disc ps-5 text-sm text-muted-foreground">{notes.map((note, index) => <li key={`${note}${index}`} data-note={note.split(":")[0]}>{smartNoteText(note, language)}</li>)}</ul>
    </div>
  );
}
