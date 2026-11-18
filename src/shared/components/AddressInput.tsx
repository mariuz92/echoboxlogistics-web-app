import { useState } from "react";
import { Input } from "antd";
import { Autocomplete, useJsApiLoader, type Libraries } from "@react-google-maps/api";
import { env } from "../../config/env";

interface AddressInputProps {
  value?: string | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  size?: "small" | "middle" | "large";
}

// Europe-wide bias, same as the previous implementation.
const EUROPE_BOUNDS = { north: 71.0, south: 34.5, west: -25.0, east: 45.0 };
const LIBRARIES: Libraries = ["places"];

function PlainAddressInput({ value, onChange, placeholder, disabled, id, size }: AddressInputProps) {
  return (
    <Input
      id={id}
      size={size}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      autoComplete="street-address"
    />
  );
}

function PlacesAddressInput(props: AddressInputProps) {
  const { value, onChange, placeholder, disabled, id, size } = props;
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: env.googleMapsApiKey ?? "",
    libraries: LIBRARIES,
    language: "it",
  });

  // If Google Maps cannot load, the field still works as a plain text input.
  if (loadError || !isLoaded) return <PlainAddressInput {...props} />;

  return (
    <Autocomplete
      onLoad={setAutocomplete}
      onPlaceChanged={() => {
        const place = autocomplete?.getPlace();
        const address = place?.formatted_address || place?.name;
        if (address) onChange?.(address);
      }}
      options={{ bounds: EUROPE_BOUNDS, fields: ["formatted_address", "name"] }}
    >
      <Input
        id={id}
        size={size}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        // Free typing is kept in the form so a manually typed address is valid
        // even when no suggestion is picked.
        onChange={(e) => onChange?.(e.target.value)}
        autoComplete="off"
      />
    </Autocomplete>
  );
}

/** Address field with Google Places suggestions when an API key is configured. */
export function AddressInput(props: AddressInputProps) {
  return env.googleMapsApiKey ? <PlacesAddressInput {...props} /> : <PlainAddressInput {...props} />;
}
