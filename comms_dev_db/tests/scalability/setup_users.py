"""
Create a bunch of users with role 'Designer'
ENH To be realistic we should be using an external ID provider ie Keycloak
"""

from myworldapp.core.server.models.myw_user import MywUser
from myworldapp.core.server.models.myw_user_role import MywUserRole
from myworldapp.core.server.models.myw_role import MywRole
from myworldapp.core.server.base.db.globals import Session


num_users = 5000
roles = ["Designer"]
delete = False

for user_num in range(num_users):
    username = "locust_{:04d}".format(user_num)

    user = Session.query(MywUser).filter(MywUser.username == username).first()
    if user is not None:
        if delete:
            # Delete substructure
            for sub_rec in user.substructure():
                Session.delete(sub_rec)
            Session.delete(user)
            Session.flush()
        else:
            continue

    print("Create ", username)

    rec = MywUser(
        username=username, password="b34ed43434bf57ebedb84b4714d5c669", email="", locked_out=False
    )
    Session.add(rec)
    Session.flush()

    newId = rec.id

    for role_name in roles:
        role = Session.query(MywRole).filter(MywRole.name == role_name).first()
        role_id = role.id
        user_role = MywUserRole(user_id=newId, role_id=role_id)
        Session.add(user_role)
