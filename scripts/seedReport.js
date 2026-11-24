/** Prints the outcome of a legacy seed run. */
export function printSeedResult({ skipped, checksum, stats }) {
  if (skipped) {
    console.log(`Already imported (sha256 ${checksum.slice(0, 12)}…). Nothing to do.`);
    return;
  }
  console.log(`Imported legacy dataset (sha256 ${checksum.slice(0, 12)}…)`);
  console.log(`  records ${stats.records}, imported ${stats.imported}, failed to parse ${stats.failed}`);
  console.log(`  brands ${stats.brands}, generics ${stats.generics}`);
  console.log(`  prices added ${stats.pricesAdded}, changed ${stats.pricesChanged}, deactivated products ${stats.deactivated}`);
  if (stats.conflicts) console.log(`  conflicts flagged ${stats.conflicts} (see data_conflicts)`);
  if (stats.failed) console.log('  Rows that failed are kept in source_records with parse_status = failed.');
}
