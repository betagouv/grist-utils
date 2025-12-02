# Users map


**Status: ✅ Ready to be used in production**

Given a CSV file containing a dump of all our users which contains the SIRET of their organisation, retrieve the location of users' org.

## Prerequisites

Dependencies:
 - curl (on Debian-based distributions: `apt install curl`)
 - csvtool (on Debian-based distributions: `apt install csvtool`)
 - the list of the French organizations identified with their SIRET and geolocation: https://files.data.gouv.fr/geo-sirene/last/

## Usage

```bash
# This will download the list of geolocation of organizations automatically:
./build-users-map.sh /path/to/all-users.csv /tmp/destination.csv

# This will reuse the passed file of geolocation
STOCK_ETABLISSEMENT=/path/to/StockEtablissementActif_utf8_geo.csv.gz ./build-users-map.sh /path/to/all-users.csv /tmp/destination.csv
```

Where the destination will contain all the field of the passed input csv plus the latitude and the longitude.

Other available optional env variables:
- `CSVTOOL` to specify the path to the csvtool binary;
- `CURL` to specify the path to the curl binary;
- `CLEANUP=1` to cleanup the temporary files after the execution;
- `DEDUP=1` to deduplicate the users email (see usage with multiple CSV below)

## Usage for multiple CSVs with deduplicated users

In order to avoid users duplication, you may prepend `DEDUP=1` to remove records with duplicated emails:
```bash
# Concatenate CSVs
cat /path/to/ANCT-all-users.csv <(tail -n +2 /path/to/DINUM-all-users.csv) > /tmp/concatenated-all-users.csv

# Run the script with DEDUP=1
DEDUP=1 STOCK_ETABLISSEMENT=/path/to/StockEtablissementActif_utf8_geo.csv.gz ./build-users-map.sh /tmp/concatenated-all-users.csv /tmp/destination.csv
```
