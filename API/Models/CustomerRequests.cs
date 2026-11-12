namespace Team7Books.Api.Models;

// Sign-up form input. IDs, dates, and the password hash are set by the server.
// Fields are nullable so CustomerValidation, not the framework, words the errors.
public class RegisterCustomerRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Password { get; set; }
}

public class SignInCustomerRequest
{
    public string? Email { get; set; }
    public string? Password { get; set; }
}

// Account Info form. The password changes through ChangePasswordRequest.
public class UpdateCustomerRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
}

public class ChangePasswordRequest
{
    public string? CurrentPassword { get; set; }
    public string? NewPassword { get; set; }
}

// The only card details the browser sends; never the full number.
public class AddPaymentMethodRequest
{
    public string? Brand { get; set; }
    public string? Last4 { get; set; }
    public int? ExpMonth { get; set; }
    public int? ExpYear { get; set; }
    public string? NameOnCard { get; set; }
    public bool MakeDefault { get; set; }
}

// The return/cancel form: "Return" or "Cancellation", a listed reason, and comments.
public class OrderRefundRequest
{
    public string? Type { get; set; }
    public string? Reason { get; set; }
    public string? Comments { get; set; }
}

// What the browser sees about a signed-in customer; never the password hash.
public record CustomerProfile(int Id, string FirstName, string LastName, string Email, string? Phone,
    DateTimeOffset CreatedAt)
{
    public static CustomerProfile From(Customer customer) =>
        new(customer.Id, customer.FirstName, customer.LastName, customer.Email, customer.Phone, customer.CreatedAt);
}
