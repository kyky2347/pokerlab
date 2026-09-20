"""Upgrade the configured database without starting the API / 独立升级数据库。"""

from pokerlab_api.database import initialize_database

if __name__ == "__main__":
    initialize_database()
    print("Database schema is current. / 数据库结构已更新。")
