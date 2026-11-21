\getenv app_password COMPANY_DB_PASSWORD
CREATE ROLE autoparts_app LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD :'app_password';
ALTER DATABASE autoparts_company OWNER TO autoparts_app;
