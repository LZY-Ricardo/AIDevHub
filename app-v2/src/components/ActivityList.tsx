interface Activity {
  id: string;
  time: string;
  description: string;
}

interface ActivityListProps {
  activities: Activity[];
}

export function ActivityList({ activities }: ActivityListProps) {
  if (activities.length === 0) {
    return <div className="ui-activityEmpty">暂无最近活动</div>;
  }

  return (
    <ul className="ui-activityList">
      {activities.map((activity) => (
        <li key={activity.id} className="ui-activityItem">
          <span className="ui-activityTime">{activity.time}</span>
          <span className="ui-activityDesc">{activity.description}</span>
        </li>
      ))}
    </ul>
  );
}
