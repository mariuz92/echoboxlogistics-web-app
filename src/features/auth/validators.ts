import type { Rule } from "antd/es/form";

/** Mirrors the password policy in supabase/config.toml (lower_upper_letters_digits, min 8). */
export const passwordRules: Rule[] = [
  { required: true, message: "Inserisci una password" },
  { min: 8, message: "Almeno 8 caratteri" },
  { pattern: /[a-z]/, message: "Almeno una lettera minuscola" },
  { pattern: /[A-Z]/, message: "Almeno una lettera maiuscola" },
  { pattern: /[0-9]/, message: "Almeno una cifra" },
];

export const confirmPasswordRule = (field = "password"): Rule => {
  return ({ getFieldValue }) => ({
    validator(_, value) {
      if (!value || getFieldValue(field) === value) return Promise.resolve();
      return Promise.reject(new Error("Le password non coincidono"));
    },
  });
};

export const phoneRules: Rule[] = [
  { pattern: /^[0-9+\s()-]{6,20}$/, message: "Numero di telefono non valido" },
];
