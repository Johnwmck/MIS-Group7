using System.ComponentModel.DataAnnotations;

namespace Team7Books.Api.Services;

// Customer account rules shared by sign-up and saved-state loading. Each check
// returns "" when valid, otherwise a message the customer can act on.
public static class CustomerValidation
{
    public const int MaxNameLength = 50;
    public const int MaxEmailLength = 254;
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 128;
    public const int MaxFavorites = 500;
    private const string PhoneSymbols = " +-().";

    // --- Normalizing input before it is saved or compared ---

    public static string NormalizeEmail(string? email) => (email ?? string.Empty).Trim().ToLowerInvariant();

    public static string? NormalizePhone(string? phone) =>
        string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();

    // --- Profile and password checks ---

    public static string GetProfileError(string? firstName, string? lastName, string? email, string? phone)
    {
        var error = GetNameError("First name", firstName);
        if (error == "") error = GetNameError("Last name", lastName);
        if (error == "") error = GetEmailError(email);
        if (error == "") error = GetPhoneError(phone);
        return error;
    }

    public static string GetPasswordError(string? password) =>
        password is null || password.Length < MinPasswordLength || password.Length > MaxPasswordLength
            ? $"Use a password of {MinPasswordLength} to {MaxPasswordLength} characters."
            : "";

    private static string GetNameError(string label, string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return label + " is required.";
        return name.Trim().Length > MaxNameLength
            ? $"{label} must be {MaxNameLength} characters or fewer."
            : "";
    }

    private static string GetEmailError(string? email)
    {
        var trimmed = (email ?? string.Empty).Trim();
        var valid = trimmed.Length > 0 && trimmed.Length <= MaxEmailLength &&
            !trimmed.Any(char.IsWhiteSpace) && new EmailAddressAttribute().IsValid(trimmed);
        return valid ? "" : "Enter a valid email address.";
    }

    // Optional. Accepts common formats such as (205) 555-0107 or +1 205 555 0107.
    private static string GetPhoneError(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return "";
        var trimmed = phone.Trim();
        var digitCount = trimmed.Count(char.IsAsciiDigit);
        var valid = trimmed.All(c => char.IsAsciiDigit(c) || PhoneSymbols.Contains(c)) &&
            digitCount >= 10 && digitCount <= 15;
        return valid ? "" : "Enter a phone number with 10 to 15 digits, or leave it blank.";
    }
}
