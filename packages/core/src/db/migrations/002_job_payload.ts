/** Job-type-specific data as JSON, e.g. { remoteRef, size } for delete_remote
 *  jobs, whose file_parts row is already gone when the job runs. */
export const MIGRATION_002_JOB_PAYLOAD = `
ALTER TABLE jobs ADD COLUMN payload TEXT;
`;
