namespace Team7Books.Api.Models;

public class Promotion
{
    public int Id { get; set; }
    public Guid Revision { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public List<int> BookIds { get; set; } = new();
    public decimal PercentOff { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public bool Active { get; set; } = true;
    public bool MembersOnly { get; set; }
}

public record RewardEntry(int CustomerId, int OrderId, string Kind, int Points, DateTimeOffset Date);

public class StaffAccount
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Employee";
    public bool Active { get; set; } = true;
    public Guid SessionStamp { get; set; } = Guid.NewGuid();
}
public record StaffProfile(int Id, string Name, string Username, string Role, bool Active)
{
    public static StaffProfile From(StaffAccount a) => new(a.Id, a.Name, a.Username, a.Role, a.Active);
}
public record StaffLogin(string Username, string Password);
public record StaffEdit(string Name, string Username, string? Password, bool Active);
