// The disciplines of the drawing register, read by the server (authority per discipline) and by the screen (the picker).
export const DESIGN_DISCIPLINES = ["architectural", "interior", "landscape", "structural", "civil", "mechanical", "electrical", "plumbing", "fire_fighting", "other"] as const;
export type DesignDiscipline = (typeof DESIGN_DISCIPLINES)[number];
