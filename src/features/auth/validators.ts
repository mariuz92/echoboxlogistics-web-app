import type { Rule } from "antd/es/form";
import { t } from "../../i18n";

/** Mirrors the password policy in supabase/config.toml (lower_upper_letters_digits, min 8). */
export const passwordRules: Rule[] = [
  { required: true, message: t("Inserisci una password") },
  { min: 8, message: t("Almeno 8 caratteri") },
  { pattern: /[a-z]/, message: t("Almeno una lettera minuscola") },
  { pattern: /[A-Z]/, message: t("Almeno una lettera maiuscola") },
  { pattern: /[0-9]/, message: t("Almeno una cifra") },
];

export const confirmPasswordRule = (field = "password"): Rule => {
  return ({ getFieldValue }) => ({
    validator(_, value) {
      if (!value || getFieldValue(field) === value) return Promise.resolve();
      return Promise.reject(new Error(t("Le password non coincidono")));
    },
  });
};

export const phoneRules: Rule[] = [
  { pattern: /^[0-9+\s()-]{6,20}$/, message: t("Numero di telefono non valido") },
];
