import React from "react";
// The message beside a field that the form found wrong (see formFieldErrors in client/src/lib/formValidation.ts). Nothing is rendered when the field is fine.
export function FieldError({ id, message }: { id: string; message?: string | null }) {
  return message ? <p id={id} role="alert" className="mt-1 text-sm text-red-700">{message}</p> : null;
}
