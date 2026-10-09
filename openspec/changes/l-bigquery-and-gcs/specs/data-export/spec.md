## ADDED Requirements

### Requirement: CSV export tool
The `export_data` tool (owned by change H, built-in source `export`) SHALL be hardened by this change and SHALL accept `{ data: object[], headers: string[], format: "csv", filename?: string }` and return `{ success:true, content (base64), mimeType: "text/csv", filename, rowCount, columnCount }` or `{ success:false, error, hint }`. Empty `data`, empty `headers` or no header present in the first row SHALL be errors. Values SHALL be RFC 4180 escaped; objects SHALL be JSON-stringified.

#### Scenario: Quoting
- **WHEN** a value is `He said "hi", ok`
- **THEN** the CSV cell is `"He said ""hi"", ok"`

### Requirement: Formula injection is neutralised
A cell whose string value starts with `=`, `+`, `-`, `@`, tab or carriage return SHALL be prefixed with a single quote (`'`) before escaping, except values that are plain numbers.

#### Scenario: Formula
- **WHEN** a name is `=HYPERLINK("http://x","y")`
- **THEN** the CSV cell starts with `'=HYPERLINK` (inside quotes)

#### Scenario: Negative number
- **WHEN** a value is the number -12.5
- **THEN** it is written as `-12.5` without a quote

### Requirement: Filename and size caps
The filename SHALL be sanitised to `[A-Za-z0-9._-]` (max 80 characters, default `export`) plus `.csv`. An export SHALL be rejected with a hint when it has more than 50,000 rows or the encoded content would exceed 5 MB.

#### Scenario: Path characters
- **WHEN** the filename is `../../etc/passwd`
- **THEN** the returned filename is `etc_passwd.csv`

#### Scenario: Too big
- **WHEN** 80,000 rows are supplied
- **THEN** `success:false` with a hint to filter or aggregate first
