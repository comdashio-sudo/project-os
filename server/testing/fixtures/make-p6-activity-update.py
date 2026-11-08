import json, datetime, openpyxl
rows=json.load(open('p6rows.json'))
wb=openpyxl.Workbook(); ws=wb.active; ws.title="TASK"
ws.append(["Activity ID","Activity Name","(*)Start","(*)Finish"])
def fmt(iso):
    if not iso: return None
    d=datetime.date.fromisoformat(iso); return d.strftime("%d-%b-%y")
for r in rows: ws.append([r["id"],r["name"],fmt(r["start"]),fmt(r["finish"])])
for extra in ["ZZ9000","ZZ9010","ZZ9020","ZZ9030"]: ws.append([extra,"Not in the schedule","01-Nov-23",None])
u=wb.create_sheet("USERDATA"); u.append(["Note","Number","Date"]); u.append(["ignored sheet",42.5,datetime.date(2023,10,19)])
wb.save("p6-activity-update.xlsx")
