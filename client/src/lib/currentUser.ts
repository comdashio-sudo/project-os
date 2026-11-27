// Q-72 (1): who is signed in, as a label for a file's header («requested by»). The app's auth hook keeps it; anything that only needs the label (the Excel export) reads it
// without a hook, so it does not need the auth query to be mounted around it.
let label: string | null = null;
export const setCurrentUserLabel = (value: string | null) => { label = value; };
export const currentUserLabel = () => label;
