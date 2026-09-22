-- Allow base64 data-URL file uploads (up to ~2MB) in registration answers.
ALTER TABLE `registration_data` MODIFY `field_value` LONGTEXT NOT NULL;
