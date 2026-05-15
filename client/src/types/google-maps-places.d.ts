/**
 * Type declarations for Google Maps Places API (New) classes.
 * These are loaded at runtime via the Maps JS SDK (v=weekly).
 * @see https://developers.google.com/maps/documentation/javascript/place-autocomplete-data
 * @see https://developers.google.com/maps/documentation/javascript/place-class
 */
declare namespace google.maps.places {
  class AutocompleteSessionToken {}

  interface AutocompleteSuggestionRequest {
    input: string;
    sessionToken?: AutocompleteSessionToken;
    includedRegionCodes?: string[];
    types?: string[];
    locationBias?: google.maps.LatLngBoundsLiteral;
  }

  interface PlacePrediction {
    text: { text: string };
    placeId: string;
    toPlace(): Place;
    toString(): string;
  }

  interface AutocompleteSuggestionResult {
    placePrediction?: PlacePrediction;
  }

  interface FetchAutocompleteSuggestionsResponse {
    suggestions: AutocompleteSuggestionResult[];
  }

  class AutocompleteSuggestion {
    static fetchAutocompleteSuggestions(
      request: AutocompleteSuggestionRequest,
    ): Promise<FetchAutocompleteSuggestionsResponse>;
  }

  interface AddressComponent {
    types: string[];
    longText: string;
    shortText: string;
  }

  class Place {
    id: string;
    formattedAddress?: string;
    displayName?: { text: string } | string;
    location?: google.maps.LatLng;
    addressComponents?: AddressComponent[];
    fetchFields(request: { fields: string[] }): Promise<{ place: Place }>;
  }
}
