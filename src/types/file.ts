/** Template descriptor for new documents */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  /** Path to template file in /templates/ */
  path: string;
}
