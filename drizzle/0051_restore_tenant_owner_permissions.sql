INSERT INTO `role_permissions` (`roleId`, `permissionId`)
SELECT owner_role.`id`, permission_catalog.`id`
FROM `roles` AS owner_role
CROSS JOIN `permissions` AS permission_catalog
LEFT JOIN `role_permissions` AS existing_grant
  ON existing_grant.`roleId` = owner_role.`id`
  AND existing_grant.`permissionId` = permission_catalog.`id`
WHERE owner_role.`code` = 'TENANT_OWNER'
  AND existing_grant.`roleId` IS NULL;
