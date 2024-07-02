// User Groups
import { UserGroupsManagerContainer } from './reactViews/userGroupsManagerContainer';
import UserGroupsManagerModal from './reactViews/userGroupsManagerModal/userGroupsManagerModal';
import { UserGroupsManager } from './reactViews/userGroupsManagerModal/userGroupsManager';
import * as userGroupsManagerHooks from './reactViews/userGroupsManagerModal/userGroupsManager/hooks';
import * as userGroupsManagerFunctions from './reactViews/userGroupsManagerModal/userGroupsManager/functions';
import { UserGroupsManagerTable } from './reactViews/userGroupsManagerModal/userGroupsManagerTable';
import { UserGroupsManagerEdit } from './reactViews/userGroupsManagerModal/userGroupsManagerEdit';
import * as userGroupsManagerEditFunctions from './reactViews/userGroupsManagerModal/userGroupsManagerEdit/functions';
import { UserGroupsManagerCreate } from './reactViews/userGroupsManagerModal/userGroupsManagerCreate';
import * as userGroupsManagerCreateFunctions from './reactViews/userGroupsManagerModal/userGroupsManagerCreate/functions';
import { UserGroupsManagerUpload } from './reactViews/userGroupsManagerModal/userGroupsManagerUpload';
import * as userGroupsManagerUploadFunctions from './reactViews/userGroupsManagerModal/userGroupsManagerUpload/functions';

// Bulk Move
import { BulkMoveModeModal } from './reactViews/bulkMoveModeModal';
import { BulkMoveModeModalContainer } from './reactViews/bulkMoveModeModalContainer';

// Layout Strand
import { LayoutStrandContainer } from './reactViews/LayoutStrandContainer';
import { LayoutStrandModal } from './reactViews/LayoutStrandModal';
import { LayoutStrandContent } from './reactViews/LayoutStrandModal/LayoutStrandContent';
import * as layoutStrandContentFunctions from './reactViews/LayoutStrandModal/LayoutStrandContent/functions';

const views = [
    // User groups components
    {
        name: 'UserGroupsManagerContainer',
        component: UserGroupsManagerContainer
    },
    {
        name: 'UserGroupsManagerModal',
        component: UserGroupsManagerModal,
        hooks: userGroupsManagerHooks,
        functions: userGroupsManagerFunctions
    },
    {
        name: 'UserGroupsManager',
        component: UserGroupsManager,
        hooks: userGroupsManagerHooks,
        functions: userGroupsManagerFunctions
    },
    {
        name: 'UserGroupsManagerTable',
        component: UserGroupsManagerTable
    },
    {
        name: 'UserGroupsManagerEdit',
        component: UserGroupsManagerEdit,
        functions: userGroupsManagerEditFunctions
    },
    {
        name: 'UserGroupsManagerCreate',
        component: UserGroupsManagerCreate,
        functions: userGroupsManagerCreateFunctions
    },
    {
        name: 'UserGroupsManagerUpload',
        component: UserGroupsManagerUpload,
        functions: userGroupsManagerUploadFunctions
    },
    // Layout strand components
    {
        name: 'LayoutStrandContainer',
        component: LayoutStrandContainer
    },
    {
        name: 'LayoutStrandModal',
        component: LayoutStrandModal
    },
    {
        name: 'LayoutStrandContent',
        component: LayoutStrandContent,
        functions: layoutStrandContentFunctions
    },
    // Bulk move components
    {
        name: 'BulkMoveModeModalContainer',
        component: BulkMoveModeModalContainer
    },
    {
        name: 'BulkMoveModeModal',
        component: BulkMoveModeModal
    }
];

export default views;
